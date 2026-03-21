"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Wifi,
  Clock,
  Shield,
  List,
  ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CallLog = {
  id: string;
  callerNum: string;
  calleeNum: string;
  direction: string;
  status: string;
  duration: number;
  startedAt: string;
};

type Extension = {
  id: string;
  number: string;
  userId: string | null;
  isActive: boolean;
};

const statusConfig: Record<string, { label: string; className: string }> = {
  answered: { label: "Answered", className: "bg-green-100 text-green-700" },
  missed: { label: "Missed", className: "bg-red-100 text-red-700" },
  busy: { label: "Busy", className: "bg-yellow-100 text-yellow-700" },
  failed: { label: "Failed", className: "bg-gray-100 text-gray-600" },
};

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "inbound") return <PhoneIncoming className="h-4 w-4 text-green-500" />;
  if (direction === "internal") return <ArrowRightLeft className="h-4 w-4 text-purple-500" />;
  return <PhoneOutgoing className="h-4 w-4 text-primary" />;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rem = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rem}`;
}

export default function TelephonyPage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([fetch("/api/telephony/calls?limit=600"), fetch("/api/telephony/extensions")])
      .then(async ([callsRes, extensionsRes]) => {
        if (!callsRes.ok) throw new Error("Failed to load call logs");
        if (!extensionsRes.ok) throw new Error("Failed to load extensions");
        const callsData = (await callsRes.json()) as CallLog[];
        const extData = (await extensionsRes.json()) as Extension[];
        if (!mounted) return;
        setCalls(Array.isArray(callsData) ? callsData : []);
        setExtensions(Array.isArray(extData) ? extData : []);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load telephony data");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = extensions.length;
    const online = extensions.filter((ext) => ext.isActive).length;
    const callsToday = calls.filter((call) => {
      const started = new Date(call.startedAt);
      const now = new Date();
      return started.toDateString() === now.toDateString();
    }).length;
    const missed = calls.filter((call) => call.status === "missed").length;
    return { total, online, callsToday, missed };
  }, [calls, extensions]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          Telephony
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage extensions, call routing, and view call history</p>
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="px-6 py-4 grid grid-cols-4 gap-4 border-b bg-gray-50">
        {[
          { label: "Total Extensions", value: stats.total, icon: Phone, color: "text-[#FE0000]", bg: "bg-red-50" },
          { label: "Online Extensions", value: stats.online, icon: Wifi, color: "text-green-600", bg: "bg-green-50" },
          { label: "Calls Today", value: stats.callsToday, icon: PhoneCall, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Missed Calls", value: stats.missed, icon: PhoneMissed, color: "text-red-600", bg: "bg-red-50" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="journal" className="h-full flex flex-col">
          <div className="border-b bg-white px-6">
            <TabsList className="h-10 bg-transparent p-0 gap-0 border-none rounded-none">
              {[
                { value: "journal", label: "Journal", icon: List },
                { value: "extensions", label: "Extensions", icon: Phone },
                { value: "providers", label: "Providers", icon: Wifi },
                { value: "inbound", label: "Inbound Rules", icon: PhoneIncoming },
                { value: "outbound", label: "Outbound Rules", icon: PhoneOutgoing },
                { value: "blacklist", label: "Blacklist", icon: Shield },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#FE0000] data-[state=active]:text-[#FE0000] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-10 text-sm"
                >
                  <tab.icon className="h-3.5 w-3.5 mr-1.5" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="journal" className="flex-1 overflow-auto mt-0">
            <Card className="rounded-none border-0 shadow-none">
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 text-sm text-gray-500">Loading call logs...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableHead className="pl-6 w-40">Time</TableHead>
                        <TableHead className="w-24">Direction</TableHead>
                        <TableHead>Caller</TableHead>
                        <TableHead>Callee</TableHead>
                        <TableHead className="w-24">Duration</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calls.map((call) => (
                        <TableRow key={call.id} className="cursor-pointer hover:bg-primary/5">
                          <TableCell className="pl-6 text-sm text-gray-500">
                            {new Date(call.startedAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <DirectionIcon direction={call.direction} />
                              <span
                                className={cn(
                                  "text-xs font-medium capitalize",
                                  call.direction === "inbound"
                                    ? "text-green-600"
                                    : call.direction === "internal"
                                      ? "text-purple-600"
                                      : "text-primary"
                                )}
                              >
                                {call.direction}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-700">{call.callerNum}</TableCell>
                          <TableCell className="text-sm text-gray-700">{call.calleeNum}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Clock className="h-3.5 w-3.5 text-gray-400" />
                              {formatDuration(call.duration)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn("text-xs", statusConfig[call.status]?.className ?? "bg-gray-100 text-gray-600")}
                            >
                              {statusConfig[call.status]?.label ?? call.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="extensions" className="flex-1 overflow-auto mt-0">
            <Card className="rounded-none border-0 shadow-none">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableHead className="pl-6">Extension</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extensions.map((ext) => (
                      <TableRow key={ext.id}>
                        <TableCell className="pl-6 font-mono text-sm">{ext.number}</TableCell>
                        <TableCell className="text-sm text-gray-600">{ext.userId ? ext.userId.slice(0, 8) : "Unassigned"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={ext.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}
                          >
                            {ext.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {[
            { value: "providers", label: "Providers", icon: Wifi, desc: "Configure SIP trunks and VoIP providers" },
            { value: "inbound", label: "Inbound Rules", icon: PhoneIncoming, desc: "Set up call routing rules for incoming calls" },
            { value: "outbound", label: "Outbound Rules", icon: ArrowRightLeft, desc: "Configure outbound call routing and dial plans" },
            { value: "blacklist", label: "Blacklist", icon: Shield, desc: "Manage blocked numbers and call restrictions" },
          ].map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="flex-1 overflow-auto mt-0 bg-gray-50">
              <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
                <tab.icon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500 mb-1">{tab.label}</p>
                <p className="text-xs text-gray-400">{tab.desc}</p>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}


