import { redirect } from 'next/navigation';
export default function LegacyAdminMerchantsRedirect() {
  redirect('/merchants');
}
