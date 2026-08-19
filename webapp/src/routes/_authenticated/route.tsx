import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { auth } from "@/lib/auth/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Auth gate temporarily disabled. Restore this block to require sign-in.
    void location;
    // const { data } = await auth.getSession();
    // if (!data.session) {
    //   throw redirect({ to: "/auth", search: { redirect: location.href } });
    // }
  },
  component: () => <Outlet />,
});
