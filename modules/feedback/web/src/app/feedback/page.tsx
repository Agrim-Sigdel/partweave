import { FeedbackForm } from "../../feedback/FeedbackForm";

export default function FeedbackPage() {
  return (
    <div className="flex flex-col items-center p-8">
      <h1 className="text-3xl font-bold mb-8">Feedback</h1>
      <FeedbackForm />
    </div>
  );
}
