const getDefaultRouteByRole = (role) => {
  return role === 'admin' ? '/admin' : '/dashboard';
};

export default getDefaultRouteByRole;
