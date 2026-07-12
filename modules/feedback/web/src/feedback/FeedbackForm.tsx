"use client";

import { useState } from "react";
import { API_URL } from "@/lib/config";

export function FeedbackForm() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch(`${API_URL}/api/feedback/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, message, rating: 5 }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      setStatus("success");
      setName("");
      setMessage("");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 border rounded max-w-md">
      <h3 className="text-lg font-bold">Leave Feedback</h3>
      
      <label className="flex flex-col gap-1">
        Name
        <input 
          type="text" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          className="border p-2 rounded"
        />
      </label>

      <label className="flex flex-col gap-1">
        Message
        <textarea 
          required 
          value={message} 
          onChange={(e) => setMessage(e.target.value)} 
          className="border p-2 rounded"
          rows={4}
        />
      </label>

      <button 
        type="submit" 
        disabled={status === "loading"}
        className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {status === "loading" ? "Submitting..." : "Submit"}
      </button>

      {status === "success" && <p className="text-green-600">Thank you for your feedback!</p>}
      {status === "error" && <p className="text-red-600">Something went wrong. Please try again.</p>}
    </form>
  );
}
