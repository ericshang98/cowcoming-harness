"""Optional in-process HTTP extension for BenBen. Does not start on import.
Run only instead of an existing controller, after device activation approval.
The original controller remains sole owner of serial, trajectories and torque.
"""
import json
import math
import os
import sys
import threading
import time

ACTIONS = frozenset(('nod', 'nod_double', 'shake_head', 'tilt_left', 'tilt_right'))


class HarnessExtension:
    def __init__(self, controller, load_motions, clock=time.time):
        self.controller, self.load_motions, self.clock = controller, load_motions, clock
        self.seen, self.active, self.last_owned = set(), None, None

    def state(self):
        c = self.controller
        s = c.snapshot()
        return {'online': True, 'hardware': bool(c.allow_hardware and c.port and c.motion_profile == 'five_servo'), 'busy': bool(s.get('busy') or c.live),
                'fault': bool(c.motion_fault), 'profileId': 'benben-five-servo',
                'capabilities': sorted(ACTIONS & self.load_motions().keys()),
                'holding': bool((s.get('motion_owner') or {}).get('holding'))}

    def run(self, plan):
        c = self.controller
        if not isinstance(plan, dict) or plan.get('profileId') != 'benben-five-servo' or plan.get('profileVersion') != '1':
            raise ValueError('profile mismatch')
        pid = plan.get('planId')
        if not isinstance(pid, str) or not 1 <= len(pid) <= 240:
            raise ValueError('invalid planId')
        expiry = plan.get('expiresAt')
        if not isinstance(expiry, (int, float)) or not math.isfinite(expiry) or not self.clock()*1000 < expiry <= self.clock()*1000 + 60000:
            raise ValueError('stale or invalid expiry')
        steps = plan.get('steps')
        if not isinstance(steps, list) or len(steps) != 1 or not isinstance(steps[0], dict):
            raise ValueError('one registered action required')
        step = steps[0]
        if step.get('capabilityId') not in ACTIONS or step.get('args') != {}:
            raise ValueError('only fixed taught actions without parameter overrides are allowed')
        motion = self.load_motions().get(step['capabilityId'])
        if not motion or not motion.get('hardware_ready'):
            raise ValueError('motion unavailable')
        c.snapshot()  # Refresh faults reported by the original holding owner.
        with c.lock:
            if self.clock()*1000 >= expiry:
                raise ValueError('plan expired while waiting for controller')
            if c.motion_profile != 'five_servo' or not c.allow_hardware or not c.port:
                raise RuntimeError('hardware disabled')
            if c.live or c.state['busy'] or c._stop_callers or c.motion_fault:
                raise RuntimeError('controller unavailable; finish its existing interaction first')
            if pid in self.seen:
                raise RuntimeError('duplicate plan; never replay')
            if len(self.seen) >= 10000:
                raise RuntimeError('session capacity reached')
            self.seen.add(pid)
            self.active = self.last_owned = pid
            c.cancel = threading.Event()
            cancel = c.cancel
            c.worker = threading.current_thread()
            c.publish(busy=True, phase='harness', request_id=pid, motion='waiting')
        def publish(**values):
            if cancel.is_set():
                raise RuntimeError('cancelled')
            c.publish(**values)
        try:
            report = c.motion_player(motion, 'hardware', c.port, cancel, publish)
            if cancel.is_set():
                return {'planId': pid, 'status': 'unknown', 'sensorVerified': False}
            # BenBen's success basis is timed commands. Never invent position feedback.
            basis = report.get('completion_basis')
            if report.get('hardware_executed') is not True or basis != 'timed_commands':
                raise RuntimeError('missing timed-command evidence')
            return {'planId': pid, 'status': 'completed', 'sensorVerified': False,
                    'completionBasis': 'timed_commands', 'holding': bool(report.get('motion_holding'))}
        except Exception:
            c.stop()  # Only this owned, active action; never normal completion cleanup.
            return {'planId': pid, 'status': 'fault', 'sensorVerified': False}
        finally:
            with c.lock:
                self.active = None
                c.publish(busy=False, phase='idle')

    def stop(self, plan_id):
        c = self.controller
        with c.lock:
            if not plan_id or plan_id != self.last_owned or c.live or c.state.get('request_id') != plan_id:
                raise RuntimeError('this client does not own the current action')
            c._stop_callers += 1  # Reserve ownership without holding the lock while motor stop waits.
        try:
            c.stop()
        finally:
            with c.lock:
                c._stop_callers -= 1
        return {'confirmed': True}


def install(module):
    original = module.make_handler
    def factory(controller, port, token):
        base = original(controller, port, token)
        extension = HarnessExtension(controller, module.load_motions)
        class Handler(base):
            def authorized(self):
                return self.local() and self.headers.get('X-Niu-Reaction') == token and self.headers.get('Origin') in (None, f'http://127.0.0.1:{port}')
            def do_GET(self):
                if self.path != '/harness/state':
                    return super().do_GET()
                if not self.authorized():
                    self.send_error(403); return
                self.send_json(200, extension.state())
            def do_POST(self):
                if self.path not in ('/harness/run', '/harness/stop'):
                    return super().do_POST()
                if not self.authorized():
                    self.send_error(403); return
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length < 32768: raise ValueError('invalid body size')
                    value = json.loads(self.rfile.read(length))
                    if not isinstance(value, dict): raise ValueError('object required')
                    result = extension.run(value) if self.path == '/harness/run' else extension.stop(value.get('planId'))
                    self.send_json(200, result)
                except ValueError:
                    self.send_json(400, {'error': 'invalid harness request'})
                except RuntimeError:
                    self.send_json(409, {'error': 'controller unavailable or action not owned'})
        return Handler
    module.make_handler = factory


if __name__ == '__main__':
    root = os.environ.get('BENBEN_ROOT')
    if not root: raise SystemExit('BENBEN_ROOT is required; no services have been started')
    sys.path.insert(0, root)
    from niu_reactions import server
    install(server)
    server.main()
