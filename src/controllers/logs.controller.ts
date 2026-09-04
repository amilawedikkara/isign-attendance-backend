import { spawn } from "child_process";
import { Request, Response } from "express";

export const streamLogs = (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const journal = spawn("journalctl", [
    "-u", "isignServiceBE",
    "-f",
    "--no-pager",
    "-n", "50",       // send last 50 lines immediately, then stream new ones
  ]);

  journal.stdout.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      res.write(`data: ${line}\n\n`);
    }
  });

  journal.stderr.on("data", (data: Buffer) => {
    res.write(`data: [stderr] ${data.toString()}\n\n`);
  });

  journal.on("error", (err) => {
    res.write(`data: [error] Failed to start journalctl: ${err.message}\n\n`);
    res.end();
  });

  req.on("close", () => {
    journal.kill();
  });
};

export const streamIVSLogs = (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const journal = spawn("journalctl", [
    "-u", "isignServiceVerify",
    "-f",
    "--no-pager",
    "-n", "50",       // send last 50 lines immediately, then stream new ones
  ]);

  journal.stdout.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      res.write(`data: ${line}\n\n`);
    }
  });

  journal.stderr.on("data", (data: Buffer) => {
    res.write(`data: [stderr] ${data.toString()}\n\n`);
  });

  journal.on("error", (err) => {
    res.write(`data: [error] Failed to start journalctl: ${err.message}\n\n`);
    res.end();
  });

  req.on("close", () => {
    journal.kill();
  });
};
