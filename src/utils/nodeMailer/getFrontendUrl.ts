export const getFrontendUrl = () => {
  return process.env.NODE_ENV === "DEVELOPMENT"
    ? process.env.FRONTEND_LOCAL_URL
    : process.env.FRONTEND_AWS_URL;
};
