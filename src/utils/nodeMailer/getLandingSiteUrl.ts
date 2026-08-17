// The marketing/landing site is a separate Next.js app from this API's own
// frontend (app.kolabme.com) — a guest-facing link (e.g. a self-service cancel
// link) must point there, not at the authenticated dashboard app.
export const getLandingSiteUrl = () => {
  return (process.env.NODE_ENV || "").toUpperCase() === "DEVELOPMENT"
    ? "http://localhost:3000"
    : "https://kolabme.com";
};
