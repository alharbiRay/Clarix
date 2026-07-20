import { RfqForm } from "@/components/rfq-form";
import { FadeIn } from "@/components/motion";

export default function NewRfqPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <FadeIn>
        <h1 className="text-2xl font-bold tracking-tight">New RFQ</h1>
        <p className="mt-1 text-sm text-slate-500">
          Define what you need, then invite suppliers to quote.
        </p>
      </FadeIn>
      <FadeIn delay={0.03}>
        <RfqForm />
      </FadeIn>
    </div>
  );
}
