# Security

This suite is intended for a trusted private league behind HTTPS. It is not represented as a hardened, multi-tenant public service. Follow the installation and operations guides; keep registration closed, secrets outside Git, and backups encrypted. Use supported dependency updates and test them before rollout.

Please report vulnerabilities using this repository’s **Security → Report a vulnerability** private reporting form when available. If unavailable, open an issue asking for a private reporting channel without disclosing exploit details, credentials, or participant data. Do not test against installations you do not control.

Reports should describe the affected revision, expected/actual behavior, and a minimal reproduction using synthetic accounts. Never upload `.env`, APNs keys, database dumps, session cookies, real user records, or unredacted logs.

Authentication/rate limits, kickoff and hidden-pick boundaries, native token ownership, and secret-free publication are security-sensitive changes. A passing test suite or dependency audit is not a complete security certification.
