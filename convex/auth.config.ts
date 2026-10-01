// Tells Convex to accept JWTs minted by Clerk's "convex" JWT template.
// CLERK_JWT_ISSUER_DOMAIN is set on the Convex deployment (dev AND prod):
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<issuer>.clerk.accounts.dev
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
