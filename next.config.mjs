/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    // @react-pdf/renderer (via pdfkit) must not be webpack-bundled — it loads its standard
    // fonts from disk at runtime. Externalise it AND force-include pdfkit's font assets in
    // the serverless bundle, or finalising a plan 500s on Vercel with MODULE_NOT_FOUND on
    // pdfkit/js/standard-fonts/Helvetica.cjs (works in dev because dev doesn't trace/bundle).
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
    outputFileTracingIncludes: {
      "/plan/[patientId]": ["./node_modules/pdfkit/js/**/*"],
      "/plan/[patientId]/prepare": ["./node_modules/pdfkit/js/**/*"],
      "/patients/[id]/history": ["./node_modules/pdfkit/js/**/*"],
    },
  },
};
export default nextConfig;
