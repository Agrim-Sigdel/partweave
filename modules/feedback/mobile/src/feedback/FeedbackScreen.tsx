import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator } from "react-native";
import { API_URL } from "@/lib/config";

export function FeedbackScreen() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async () => {
    if (!message) return;
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
    <View style={styles.container}>
      <Text style={styles.title}>Leave Feedback</Text>
      
      <Text style={styles.label}>Name</Text>
      <TextInput 
        style={styles.input} 
        value={name} 
        onChangeText={setName} 
        placeholder="Your name"
      />

      <Text style={styles.label}>Message</Text>
      <TextInput 
        style={[styles.input, styles.textArea]} 
        value={message} 
        onChangeText={setMessage} 
        placeholder="Your feedback..."
        multiline
        numberOfLines={4}
      />

      <Button 
        title={status === "loading" ? "Submitting..." : "Submit"} 
        onPress={handleSubmit} 
        disabled={status === "loading"} 
      />

      {status === "success" && <Text style={styles.success}>Thank you for your feedback!</Text>}
      {status === "error" && <Text style={styles.error}>Something went wrong. Please try again.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 8,
    margin: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  success: {
    color: "green",
    marginTop: 16,
  },
  error: {
    color: "red",
    marginTop: 16,
  },
});
