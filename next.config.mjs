/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serves Firebase's sign-in handler from this app's own domain so the
  // Google account chooser shows the custom domain (authDomain) instead of
  // mynextlms.firebaseapp.com.
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://mynextlms.firebaseapp.com/__/auth/:path*",
      },
      {
        source: "/__/firebase/:path*",
        destination: "https://mynextlms.firebaseapp.com/__/firebase/:path*",
      },
    ];
  },
};

export default nextConfig;
