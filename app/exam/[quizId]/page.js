import ExamLink from "../../../components/exams/ExamLink";

export const metadata = { title: "Model Test", robots: { index: false, follow: false } };

// Landing page of an exam's QR code / short link (https://nextacademy.sg/exam/<quizId>).
export default async function ExamLinkPage({ params }) {
  const { quizId } = await params;
  return <ExamLink quizId={quizId} />;
}
