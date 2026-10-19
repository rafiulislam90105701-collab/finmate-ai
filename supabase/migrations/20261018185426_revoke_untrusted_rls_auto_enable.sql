-- The event trigger runs automatically as a database event. It must not be
-- callable through the exposed Data API by anonymous or signed-in clients.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
