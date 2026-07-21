"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createRfq, autofillRfqFromText } from "@/app/(dashboard)/rfqs/actions";
import { rfqSchema, CURRENCIES, type RfqFormValues } from "@/lib/validations/rfq";
import { sanitizeDecimalInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RfqForm() {
  const [isPending, startTransition] = useTransition();
  const [supplierInput, setSupplierInput] = useState("");

  const form = useForm<RfqFormValues>({
    resolver: zodResolver(rfqSchema),
    defaultValues: {
      title: "",
      project: "",
      description: "",
      currency: "USD",
      deadline: "",
      items: [{ name: "", description: "", quantity: 1, unit: "pcs" }],
      suppliers: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const suppliers = form.watch("suppliers");
  const [pasteText, setPasteText] = useState("");
  const [isAutofilling, startAutofillTransition] = useTransition();

  function addSupplier(raw: string) {
    const email = raw.trim().replace(/[,;]$/, "").toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(`"${email}" is not a valid email`);
      return;
    }
    if (suppliers.includes(email)) {
      toast.error("Supplier already added");
      return;
    }
    form.setValue("suppliers", [...suppliers, email], { shouldValidate: true });
    setSupplierInput("");
  }

  function removeSupplier(email: string) {
    form.setValue(
      "suppliers",
      suppliers.filter((s) => s !== email),
      { shouldValidate: true }
    );
  }

  function handleAutofill() {
    if (!pasteText.trim()) {
      toast.error("Paste some text first");
      return;
    }
    startAutofillTransition(async () => {
      const result = await autofillRfqFromText(pasteText);
      if (result.error || !result.data) {
        toast.error(result.error ?? "Autofill failed");
        return;
      }
      const data = result.data;

      if (data.title) form.setValue("title", data.title, { shouldValidate: true });
      if (data.project) form.setValue("project", data.project, { shouldValidate: true });
      if (data.description)
        form.setValue("description", data.description, { shouldValidate: true });
      if (data.currency) {
        const match = CURRENCIES.find(
          (c) => c.toLowerCase() === data.currency!.toLowerCase()
        );
        if (match) form.setValue("currency", match, { shouldValidate: true });
      }
      if (data.deadline) form.setValue("deadline", data.deadline, { shouldValidate: true });
      if (data.items.length > 0) {
        replace(
          data.items.map((i) => ({
            name: i.name,
            description: i.description ?? "",
            quantity: i.quantity,
            unit: i.unit || "pcs",
          }))
        );
      }
      if (data.supplier_emails.length > 0) {
        const valid = data.supplier_emails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
        if (valid.length > 0) {
          const merged = Array.from(new Set([...suppliers, ...valid]));
          form.setValue("suppliers", merged, { shouldValidate: true });
        }
      }

      toast.success("Form filled in — review before creating the RFQ.");
    });
  }

  function onSubmit(values: RfqFormValues) {
    startTransition(async () => {
      const result = await createRfq(values);
      // createRfq redirects on success, so a return value means failure
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Smart paste
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Paste an email, spec sheet, or notes describing what you need —
              AI will fill in the title, items, and suppliers below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={4}
              placeholder={`e.g. "Need quotes for 10 laptops (Dell Latitude or similar) and 5 monitors for the new office. Budget in USD, need by end of next month. Reach out to sales@acmesupplies.com."`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
              disabled={isAutofilling}
              onClick={handleAutofill}
            >
              {isAutofilling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Fill with AI
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">RFQ details</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              What are you requesting quotes for?
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Office network equipment Q3"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="project"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. HQ renovation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Context, specs, delivery location, or anything suppliers should know."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Line items</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Each supplier will quote a price per item.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_110px_110px_auto]"
              >
                <FormField
                  control={form.control}
                  name={`items.${index}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Item *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 24-port PoE switch" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Qty *</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          {...field}
                          onChange={(e) =>
                            field.onChange(sanitizeDecimalInput(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.unit`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Unit</FormLabel>
                      <FormControl>
                        <Input placeholder="pcs" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name={`items.${index}.description`}
                  render={({ field }) => (
                    <FormItem className="sm:col-span-4">
                      <FormControl>
                        <Input
                          placeholder="Optional spec / description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                append({ name: "", description: "", quantity: 1, unit: "pcs" })
              }
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Suppliers</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Each supplier receives an invitation with a unique quote link and
              the option to reply with a PDF.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="supplier@company.com — press Enter to add"
                value={supplierInput}
                onChange={(e) => setSupplierInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSupplier(supplierInput);
                  }
                }}
                onBlur={() => supplierInput && addSupplier(supplierInput)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addSupplier(supplierInput)}
              >
                Add
              </Button>
            </div>
            {suppliers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suppliers.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1 pr-1">
                    {email}
                    <button
                      type="button"
                      onClick={() => removeSupplier(email)}
                      className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {form.formState.errors.suppliers && (
              <p className="text-sm font-medium text-destructive">
                {form.formState.errors.suppliers.message}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={isPending} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create RFQ
          </Button>
        </div>
      </form>
    </Form>
  );
}
