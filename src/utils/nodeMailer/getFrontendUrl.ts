export const getFrontendUrl = () => {
  return (process.env.NODE_ENV || "").toUpperCase() === "DEVELOPMENT"
    ? process.env.FRONTEND_LOCAL_URL
    : process.env.FRONTEND_AWS_URL;
};
