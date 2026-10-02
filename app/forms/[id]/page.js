import FormFillPage from "../../../components/forms/FormFillPage";

export const metadata = { title: "Form", robots: { index: false, follow: false } };

export default async function FormPage({ params }) {
  const { id } = await params;
  return <FormFillPage formId={id} />;
}
