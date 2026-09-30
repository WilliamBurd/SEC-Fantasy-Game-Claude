import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/** The centred card every sign-in page sits in. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
        {footer && <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>}
      </Card>
    </main>
  );
}
