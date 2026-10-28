"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createRfq, autofillRfqFromText } from "@/app/(dashboard)/rfqs/actions";
import { rfqSchema, CURRENCIES, type RfqFormValues } from "@/lib/validations/rfq";
import { sanitizeDecimalInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
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
  const t = useTranslations("rfqForm");
  const tv = useTranslations("validation");

  const form = useForm<RfqFormValues>({
    resolver: zodResolver(rfqSchema),
    defaultValues: {
      title: "",
      project: "",
      description: "",
      currency: "SAR",
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
      toast.error(t("invalidEmail", { email }));
      return;
    }
    if (suppliers.includes(email)) {
      toast.error(t("alreadyAdded"));
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
      toast.error(t("pasteFirst"));
      return;
    }
    startAutofillTransition(async () => {
      const result = await autofillRfqFromText(pasteText);
      if (result.error || !result.data) {
        toast.error(result.error ?? t("autofillFailed"));
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

      toast.success(t("filled"));
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
              <Sparkles className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              {t("smartPaste")}
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t("smartPasteHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={4}
              placeholder={t("pastePlaceholder")}
              aria-label={t("smartPaste")}
              dir="auto"
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
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {t("fillAi")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("details")}</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t("detailsHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{t("title")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("titlePlaceholder")}
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
                  <FormLabel>{t("project")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("projectPlaceholder")} {...field} />
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
                    <FormLabel>{t("currency")}</FormLabel>
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
                    <FormLabel>{t("deadline")}</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("noDeadline")}
                      />
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
                  <FormLabel>{t("description")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder={t("descriptionPlaceholder")}
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
            <CardTitle className="text-sm font-semibold">{t("lineItems")}</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t("lineItemsHint")}
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
                      <FormLabel className="text-xs">{t("item")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("itemPlaceholder")} {...field} />
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
                      <FormLabel className="text-xs">{t("qty")}</FormLabel>
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
                      <FormLabel className="text-xs">{t("unit")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("unitPlaceholder")} {...field} />
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
                    aria-label={t("removeItem", { n: index + 1 })}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name={`items.${index}.description`}
                  render={({ field }) => (
                    <FormItem className="sm:col-span-4">
                      <FormControl>
                        <Input
                          placeholder={t("specPlaceholder")}
                          aria-label={t("specPlaceholder")}
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
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addItem")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("suppliers")}</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t("suppliersHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder={t("supplierPlaceholder")}
                aria-label={t("suppliers")}
                dir="ltr"
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
                {t("add")}
              </Button>
            </div>
            {suppliers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suppliers.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1 pe-1">
                    {email}
                    <button
                      type="button"
                      onClick={() => removeSupplier(email)}
                      aria-label={t("removeSupplier", { email })}
                      className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {form.formState.errors.suppliers && (
              <p className="text-sm font-medium text-destructive">
                {(() => {
                  const m = form.formState.errors.suppliers.message ?? "";
                  const map: Record<string, string> = { "Add at least one supplier email": "suppliers", "Duplicate supplier emails": "duplicates", "Invalid email": "email" };
                  return map[m] ? tv(map[m]) : m;
                })()}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={isPending} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {t("create")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
