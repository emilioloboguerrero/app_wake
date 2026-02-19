import React, { createContext, useContext } from 'react';

const UserRoleContext = createContext({ role: null });

export function useUserRole() {
  return useContext(UserRoleContext);
}

export default UserRoleContext;
