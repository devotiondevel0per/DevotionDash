"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CircleCheck, ExternalLink, FileWarning, LifeBuoy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { usePermissions } from "@/hooks/use-permissions";
import { getHelpTopicById, MODULE_LABEL, TOPIC_TYPE_LABEL } from "@/lib/help-content";

export default function HelpTopicDetailPage() {
  const { access, loading } = usePermissions();
  const params = useParams<{ topic: string }>();
  const topicId = String(params?.topic ?? "");
  const topic = useMemo(() => getHelpTopicById(topicId), [topicId]);

  if (loading) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <Card>
          <CardContent className="p-6 text-sm text-slate-600">Loading help article...</CardContent>
        </Card>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <Card className="mx-auto max-w-3xl">
          <CardContent className="p-8 text-center">
            <FileWarning className="mx-auto mb-3 h-8 w-8 text-amber-600" />
            <p className="text-sm font-medium text-slate-800">Help topic not found.</p>
            <Link href="/help" className="mt-3 inline-block text-sm font-medium text-[#b00715]">
              Back to Help Center
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canReadTopic = Boolean(access?.isAdmin || access?.permissions[topic.module]?.read);
  if (!canReadTopic) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <Card className="mx-auto max-w-3xl border-red-200">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-600" />
            <p className="text-sm font-medium text-slate-900">You do not have permission for this topic.</p>
            <p className="mt-1 text-sm text-slate-600">
              This article belongs to <strong>{MODULE_LABEL[topic.module]}</strong> module.
            </p>
            <Link href="/help" className="mt-3 inline-block text-sm font-medium text-[#b00715]">
              Back to Help Center
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-5 sm:px-6">
          <Link href="/help" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Back to Help Center
          </Link>
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FE0000]/10 text-[#FE0000]">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900">{topic.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{topic.summary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{TOPIC_TYPE_LABEL[topic.type]}</Badge>
                <Badge variant="secondary" className="text-[10px]">{MODULE_LABEL[topic.module]}</Badge>
                <Badge variant="outline" className="text-[10px]">Difficulty: {topic.difficulty}</Badge>
                <Badge variant="outline" className="text-[10px]">Updated: {topic.updatedAt}</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-6 sm:px-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Detailed Article</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {topic.articleSections.map((section, index) => (
                <div key={`${topic.id}-section-${index + 1}`} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{section.heading}</p>
                  <div className="mt-2 space-y-2 text-sm text-slate-700">
                    {section.paragraphs.map((paragraph, paragraphIndex) => (
                      <p key={`${topic.id}-section-${index + 1}-paragraph-${paragraphIndex + 1}`}>{paragraph}</p>
                    ))}
                  </div>
                  {section.checklist && section.checklist.length > 0 ? (
                    <div className="mt-3 text-xs text-slate-700">
                      <p className="font-medium text-slate-800">Checklist</p>
                      <ul className="mt-1 space-y-1">
                        {section.checklist.map((item, checklistIndex) => (
                          <li
                            key={`${topic.id}-section-${index + 1}-check-${checklistIndex + 1}`}
                            className="flex items-start gap-2"
                          >
                            <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-slate-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {section.warnings && section.warnings.length > 0 ? (
                    <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                      <p className="font-medium">Warnings</p>
                      <ul className="mt-1 space-y-1">
                        {section.warnings.map((item, warningIndex) => (
                          <li
                            key={`${topic.id}-section-${index + 1}-warn-${warningIndex + 1}`}
                            className="flex items-start gap-2"
                          >
                            <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">When To Use This</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              {topic.whenToUse.map((line) => (
                <div key={`${topic.id}-${line}`} className="flex items-start gap-2">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p>{line}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Step-By-Step</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-slate-700">
                {topic.steps.map((step, idx) => (
                  <li key={`${topic.id}-step-${idx + 1}`} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                      {idx + 1}
                    </span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Error Details (By Error Number)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topic.errorDetails.map((error) => (
                <div key={`${topic.id}-error-${error.errorNumber}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="destructive" className="text-[10px]">#{error.errorNumber}</Badge>
                    <Badge variant="outline" className="text-[10px]">{error.code}</Badge>
                    <Badge variant="outline" className="text-[10px]">HTTP {error.httpStatus}</Badge>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{error.title}</p>
                  <p className="mt-1 text-xs text-slate-600"><strong>Meaning:</strong> {error.meaning}</p>
                  <p className="mt-1 text-xs text-slate-600"><strong>Common cause:</strong> {error.commonCause}</p>
                  <div className="mt-2 text-xs text-slate-700">
                    <p className="font-medium text-slate-800">Fix steps:</p>
                    <ul className="mt-1 space-y-1">
                      {error.fixSteps.map((step, idx) => (
                        <li key={`${error.errorNumber}-fix-${idx + 1}`} className="flex items-start gap-2">
                          <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Audience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm text-slate-700">
              {topic.audience.map((item) => (
                <div key={`${topic.id}-aud-${item}`} className="rounded bg-slate-100 px-2 py-1 text-xs">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Practical Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              {topic.tips.map((tip) => (
                <div key={`${topic.id}-tip-${tip}`} className="rounded border border-slate-200 px-2.5 py-2 text-xs">
                  {tip}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={topic.relatedHref}>
                <Button className="w-full">
                  Open {MODULE_LABEL[topic.module]} Module
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Separator />
              <Link href="/help" className="block">
                <Button variant="outline" className="w-full">Browse All Help Topics</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
