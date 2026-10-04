/** Separate production output lets the public mirror run alongside localhost's dev server. */
const nextConfig = { distDir: process.env.GUARDIAN_BUILD_DIR || ".next" };
export default nextConfig;
