import { useState } from "react";
import { useRouter } from "expo-router";
import {
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/auth/auth-context";

export default function Login() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    try {
      await (isRegister ? register : login)({ email, password });
      router.replace("/");
    } catch {
      setError("Authentication failed");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isRegister ? "Create account" : "Log in"}</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={isRegister ? "Sign up" : "Log in"} onPress={onSubmit} />
      <Text style={styles.toggle} onPress={() => setIsRegister(!isRegister)}>
        {isRegister ? "Have an account? Log in" : "Need an account? Sign up"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "bold" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 10 },
  error: { color: "#dc2626" },
  toggle: { color: "#2563eb", marginTop: 8 },
});
