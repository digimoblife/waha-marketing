import { redirect } from 'next/navigation';

export default function RootRedirectPage({
  searchParams,
}: {
  searchParams: { phone?: string; jid?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams?.phone) params.set('phone', searchParams.phone);
  if (searchParams?.jid) params.set('jid', searchParams.jid);
  const qs = params.toString();
  redirect(qs ? `/inbox?${qs}` : '/inbox');
}
