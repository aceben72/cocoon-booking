## ⚠️ Production Safety Rules — Read Before Every Session

This booking app runs against a **live production database** with real client bookings and payments. There is no staging environment.

### Mandatory rules — no exceptions

1. **Never make write or delete operations against the database during testing.** This includes calling API endpoints that modify data (cancel, update status, delete, etc.). A "test" that cancels a real client appointment will send real notifications to a real customer.

2. **Never call a cancel, delete, or status-change endpoint against a real appointment or booking record.** Even if you created a test appointment, do not cancel or delete it via the API — the same code path fires client notifications.

3. **Verify changes with read-only queries only.** After deploying a change, confirm it works by reading data (GET requests, SELECT queries) — never by executing the action against a live record.

4. **If you need to test a destructive action**, describe exactly what you would do and explicitly ask Ben to confirm before proceeding. Do not proceed without a clear "yes, go ahead."

5. **Do not query for records and act on the first result.** If you need a record to test against, ask Ben to provide a specific ID. Never pick a record from the database yourself.

### Why this exists

On 29 June 2026, Claude Code cancelled a real client's paid appointment (Amber St Clare, Personal Make Up Class, 2 July) while testing a cancellation feature. The client received a cancellation notification and was upset. The appointment was restored manually but the incident caused real distress. These rules exist to prevent this from happening again.

@AGENTS.md
