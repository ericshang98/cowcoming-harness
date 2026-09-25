# Security and execution boundary

This is a local development lab, not an internet-facing robot gateway. Keep it bound to loopback. Model output is untrusted input; only registered capabilities may reach a device executor. A profile is not a physical safety certification.

Report a potential credential exposure or unauthorized hardware dispatch using the repository's private vulnerability reporting facility when available. Do not paste secrets or sensitive device details into a public issue. General non-sensitive bugs can be filed as ordinary issues.

The software runtime can cancel waits and request a stop. Physical stopping and torque behavior belong to the device controller; loss of a web connection is not proof that a device stopped. Importing a file or installing dependencies must never activate hardware.

The pet settings form sends provider keys only to the loopback Node service, which keeps them in process memory. Keys are not written to browser storage, exports or files. Disconnect removes a connection; idle expiry is checked on the next pet request after 30 minutes. Closing a tab cancels in-flight requests but does not immediately clear its saved connection. Stop the local process to remove all stored connections. Custom model endpoints are user-selected and receive that connection's key and submitted interaction history; only HTTPS or loopback HTTP endpoints are accepted, without redirects.
