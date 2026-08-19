import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { auth } from "@/lib/auth/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
  },
  component: () => <Outlet />,
});
