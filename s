[33mcommit d7b98b674a59bcfba653b7443bb543c1aa616a34[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m, [m[1;31morigin/HEAD[m[33m)[m
Author: Ben (Claude) <aceben72@gmail.com>
Date:   Mon Jul 27 19:41:01 2026 +1000

    Fix class session Mark Complete never writing to the database
    
    The "complete" action (added 7 June) only fired fire-and-forget
    Mailchimp upsert calls and always returned ok:true — it never wrote
    mailchimp_tagged_at (or anything else) to class_bookings, so a click
    looked successful in the UI but left zero trace in Supabase. It also
    never surfaced Mailchimp failures since upsertMailchimpContact
    swallowed HTTP errors internally instead of throwing.
    
    - upsertMailchimpContact now throws on a missing tag mapping or a
      failed Mailchimp API call instead of logging and returning silently.
    - The complete action now awaits each tag, persists mailchimp_tagged_at
      per booking on success, skips already-tagged bookings on retry, and
      returns a real error (502 + message) when any client fails to tag.
    - SessionDetail derives its "Mark Complete" button state from bookings'
      mailchimp_tagged_at (fetched fresh after each attempt) instead of an
      ephemeral local flag, and surfaces the server's actual error message
      via alert() on failure.
    
    Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

 app/admin/classes/[id]/SessionDetail.tsx | 26 [32m++++++++[m[31m----[m
 app/admin/classes/[id]/page.tsx          |  2 [32m+[m[31m-[m
 app/api/admin/classes/[id]/route.ts      | 70 [32m++++++++++++++++++++++++++[m[31m------[m
 lib/notifications.ts                     | 18 [32m++++[m[31m----[m
 4 files changed, 88 insertions(+), 28 deletions(-)
