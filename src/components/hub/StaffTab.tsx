import React from 'react';
import UserManagement from '../../pages/UserManagement';

export default function StaffTab({ hubSchoolId }: { hubSchoolId?: string | null }) {
  return (
    <div className="animate-fade-in-up">
      <UserManagement isHubMode={true} hubSchoolId={hubSchoolId} />
    </div>
  );
}
