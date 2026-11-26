import React from 'react';
import WorkspaceShell from '@/components/WorkspaceShell';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
