import importlib.util
import pathlib
import threading
import unittest
spec = importlib.util.spec_from_file_location('entry', pathlib.Path(__file__).parents[1] / 'bridges' / 'benben_entry.py')
entry = importlib.util.module_from_spec(spec); spec.loader.exec_module(entry)

class FakeController:
    def __init__(self):
        self.lock=threading.RLock(); self.allow_hardware=True; self.port='test'; self.motion_profile='five_servo'
        self.live=None; self.state={'busy':False}; self._stop_callers=0; self.motion_fault=None
        self.calls=[]; self.stops=0; self.cancel=threading.Event()
    def snapshot(self): return self.state
    def publish(self,**values): self.state.update(values)
    def stop(self): self.stops+=1; self.cancel.set()
    def motion_player(self,*args):
        self.calls.append(args)
        return {'hardware_executed':True,'completion_basis':'timed_commands','position_verified':False,'motion_holding':True}

def plan(): return {'planId':'p','profileId':'benben-five-servo','profileVersion':'1','expiresAt':11000,'steps':[{'capabilityId':'nod','args':{}}]}
class BridgeTest(unittest.TestCase):
    def setUp(self):
        self.c=FakeController(); self.x=entry.HarnessExtension(self.c,lambda:{'nod':{'hardware_ready':True}},clock=lambda:10)
    def test_no_motion_on_construction_or_state(self):
        self.x.state(); self.assertEqual(self.c.calls,[])
    def test_owned_timed_action_holds_and_never_claims_sensor_verification(self):
        r=self.x.run(plan()); self.assertEqual(r['status'],'completed'); self.assertFalse(r['sensorVerified']); self.assertEqual(self.c.stops,0)
        with self.assertRaises(RuntimeError): self.x.run(plan())
    def test_busy_live_or_disabled_rejected_without_motion(self):
        for field,value in [('live',{'id':'other'}),('allow_hardware',False),('motion_fault','fault')]:
            old=getattr(self.c,field);setattr(self.c,field,value)
            with self.assertRaises(RuntimeError):self.x.run(plan())
            setattr(self.c,field,old)
        self.assertEqual(self.c.calls,[])
    def test_arbitrary_action_parameters_and_expiry_rejected(self):
        for edit in [{'expiresAt':9000},{'steps':[{'capabilityId':'nod','args':{'angle':300}}]},{'steps':[{'capabilityId':'shell','args':{}}]}]:
            with self.assertRaises(ValueError):self.x.run({**plan(),**edit})
        self.assertEqual(self.c.calls,[])
    def test_stop_only_owned_action_and_no_takeover(self):
        with self.assertRaises(RuntimeError):self.x.stop('other')
        self.x.run(plan());self.x.stop('p');self.assertEqual(self.c.stops,1)
        self.c.state['request_id']='unrelated'
        with self.assertRaises(RuntimeError):self.x.stop('p')
    def test_missing_receipt_faults_and_stops_owned_action(self):
        self.c.motion_player=lambda *args:{}
        self.assertEqual(self.x.run(plan())['status'],'fault');self.assertEqual(self.c.stops,1)


class HttpContractTest(unittest.TestCase):
    def setUp(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from types import SimpleNamespace
        import urllib.request
        self.c = FakeController()
        self.token = 'fixture-token'
        class Base(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def local(inner): return inner.headers.get('Host') == f'127.0.0.1:{self.port}'
            def send_json(inner, code, value):
                encoded = entry.json.dumps(value).encode()
                inner.send_response(code)
                inner.send_header('Content-Type', 'application/json')
                inner.send_header('Content-Length', str(len(encoded)))
                inner.end_headers()
                inner.wfile.write(encoded)
            def do_GET(inner): inner.send_json(404, {})
            def do_POST(inner): inner.send_json(404, {})
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Base)
        self.port = self.server.server_address[1]
        module = SimpleNamespace(make_handler=lambda *args: Base, load_motions=lambda: {'nod': {'hardware_ready': True}})
        entry.install(module)
        self.server.RequestHandlerClass = module.make_handler(self.c, self.port, self.token)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close)
    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)
    def request(self, path, body=None, **headers):
        import urllib.request
        import urllib.error
        data = None if body is None else entry.json.dumps(body).encode()
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}{path}', data=data,
            headers={'X-Niu-Reaction': self.token, 'Content-Type': 'application/json', **headers})
        # This is a loopback test; do not use the user's HTTP proxy.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(request, timeout=2) as response:
                return response.status, entry.json.load(response)
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
            return code, None
    def test_http_rejects_missing_auth_wrong_origin_and_host(self):
        for headers in [{'X-Niu-Reaction': ''}, {'Origin': 'https://example.test'}, {'Host': 'example.test'}]:
            self.assertEqual(self.request('/harness/state', **headers)[0], 403)
        self.assertEqual(self.c.calls, [])
    def test_http_run_stop_and_duplicate_do_not_replay(self):
        request = {**plan(), 'expiresAt': entry.time.time()*1000 + 15000}
        status, receipt = self.request('/harness/run', request)
        self.assertEqual(status, 200)
        self.assertEqual(receipt['completionBasis'], 'timed_commands')
        self.assertEqual(self.request('/harness/run', request)[0], 409)
        self.assertEqual(self.request('/harness/stop', {'planId': 'unrelated'})[0], 409)
        self.assertEqual(self.request('/harness/stop', {'planId': 'p'})[0], 200)
        self.assertEqual(len(self.c.calls), 1)

class ConcurrencyTest(unittest.TestCase):
    setUp = BridgeTest.setUp
    def test_stop_during_owned_action_prevents_completion(self):
        started = threading.Event()
        def motion(*args):
            started.set()
            args[3].wait(2)
            return {'hardware_executed': True, 'completion_basis': 'timed_commands'}
        self.c.motion_player = motion
        result = []
        worker = threading.Thread(target=lambda: result.append(self.x.run(plan())))
        worker.start()
        self.assertTrue(started.wait(1))
        with self.assertRaises(RuntimeError):
            self.x.run({**plan(), 'planId': 'other'})
        self.x.stop('p')
        worker.join(2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(result[0]['status'], 'unknown')
        self.assertFalse(self.c.state['busy'])

if __name__ == '__main__':
    unittest.main()
