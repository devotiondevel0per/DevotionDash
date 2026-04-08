import { NextResponse } from "next/server";

const payload = {
  error: "Route not supported",
  message: "Email sign-up endpoint is not available. Use /login with credentials flow.",
};

export async function GET() {
  return NextResponse.json(payload, { status: 404 });
}

export async function POST() {
  return NextResponse.json(payload, { status: 404 });
}

export async function PUT() {
  return NextResponse.json(payload, { status: 404 });
}

export async function PATCH() {
  return NextResponse.json(payload, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json(payload, { status: 404 });
}

