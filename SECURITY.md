# Security and execution boundary

This is a local development lab, not an internet-facing robot gateway. Keep it bound to loopback. Model output is untrusted input; only registered capabilities may reach a device executor. A profile is not a physical safety certification.

Report a potential credential exposure or unauthorized hardware dispatch using the repository's private vulnerability reporting facility when available. Do not paste secrets or sensitive device details into a public issue. General non-sensitive bugs can be filed as ordinary issues.

The software runtime can cancel waits and request a stop. Physical stopping and torque behavior belong to the device controller; loss of a web connection is not proof that a device stopped. Importing a file or installing dependencies must never activate hardware.
