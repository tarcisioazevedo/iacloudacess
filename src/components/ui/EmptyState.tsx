import React from 'react';
import { PackageOpen, Search, UserX, HardDrive, Bell, BarChart3 } from 'lucide-react';

const ICONS: Record<string, React.ReactNode> = {
  default: <PackageOpen size={48} />,
  search: <Search size={48} />,
  students: <UserX size={48} />,
  devices: <HardDrive size={48} />,
  notifications: <Bell size={48} />,
  analytics: <BarChart3 size={48} />,
};

interface EmptyStateProps {
  icon?: keyof typeof ICONS | React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = 'default', title, description, action }: EmptyStateProps) {
  const iconNode = typeof icon === 'string' ? ICONS[icon] || ICONS.default : icon;

  return (
    <div className="empty-state animate-fade-in-up">
      <div className="empty-state-icon">{iconNode}</div>
      <div className="empty-state-title">{title}</div>
      {description && <div className="empty-state-description">{description}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
