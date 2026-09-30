import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdmin } from "@/lib/auth/dal";

/** Every admin page: admins only (everyone else gets a 404), with the tabs. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin("/admin");
  return (
    <>
      <PageHeader eyebrow="Admin" title="Control room" />
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        <AdminTabs />
        <div className="mt-5">{children}</div>
      </div>
    </>
  );
}
