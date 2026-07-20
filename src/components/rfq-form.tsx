"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createRfq } from "@/app/(dashboard)/rfqs/actions";
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

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const suppliers = form.watch("suppliers");

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
