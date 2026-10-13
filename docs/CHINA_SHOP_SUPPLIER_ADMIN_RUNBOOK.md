# GaGa China Direct — Supplier Admin Operations

## Status
- Backend: Supabase project `fcjgbbmfqdkucfpqjxae`
- Android UI: China Direct > Supplier admin review (restricted)
- Review queue RPC: `china_shop_admin_list_supplier_applications`
- Review action RPC: `china_shop_admin_review_supplier`
- Supplier onboarding, review events, and admin allowlist have RLS enabled.
- No admin account is provisioned by these migrations. **Never seed a fake verified supplier.**

## One-time admin provisioning (trusted SQL editor only)
1. Confirm the person's actual Supabase Auth user ID from the Auth dashboard.
2. Verify their authorization to act as a GaGa supplier reviewer.
3. From the privileged Supabase SQL editor, run the following, replacing the UUID:
```sql
insert into public.china_shop_admin_users (user_id)
values ('REPLACE_WITH_VERIFIED_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```
Do not add any admin provisioning function callable from the Android client. Never embed service-role credentials in an APK.

## Review procedure
1. Review registration documents using a trusted independent source.
2. Open the supplier admin review screen, load pending applications.
3. Mark under review, or reject with explanatory notes.
4. Approve only when the registration evidence has been verified; record a stable verification reference.
5. Approval creates a verified supplier record. Product publication, price checks, inventory and landed-cost quotation remain separate processes.
6. Inspect `china_shop_supplier_review_events` using privileged back-office access for the audit history.

## Security tests (performed 2026-10-12)
The following database negative test completed successfully with no changes to suppliers or admin users:
```sql
do $$
declare denied_queue boolean:=false; denied_review boolean:=false;
begin
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin
   perform * from public.china_shop_admin_list_supplier_applications(10);
 exception when others then denied_queue := position('Not authorized' in sqlerrm)>0; end;
 begin
   perform public.china_shop_admin_review_supplier(gen_random_uuid(),'approved','test','test');
 exception when others then denied_review := position('Not authorized' in sqlerrm)>0; end;
 if not denied_queue or not denied_review then
   raise exception 'Unauthorized access negative test failed';
 end if;
end $$;
```

## Release blockers
- Authorized reviewer end-to-end approval/rejection test with controlled test account
- Independently verified real supplier documents
- Product inventory, price validation and operational onboarding
- Signed release artifacts and full Android tests
- Payment/checkout and fulfillment remain disabled
