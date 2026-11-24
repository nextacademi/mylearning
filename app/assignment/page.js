import AssignmentLink from "../../components/assignments/AssignmentLink";

export const metadata = { title: "Submit Assignment", robots: { index: false, follow: false } };

// The Assignment QR's landing page: tinyurl.com/NextAssignment should
// redirect here (https://nextacademy.sg/assignment).
export default function AssignmentPage() {
  return <AssignmentLink />;
}
