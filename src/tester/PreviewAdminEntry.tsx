import { AdminPage } from '../components/admin/AdminPage';

const backToPreview = () => window.location.assign('/');

export default function PreviewAdminEntry() {
  return <AdminPage testLogin onBackToSite={backToPreview} />;
}
