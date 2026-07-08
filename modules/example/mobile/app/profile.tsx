import { Link } from "expo-router";
import { Button, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/auth-context";

export default function Profile() {
  const { user, loading, logout } = useAuth();

  if (loading)
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );

  if (!user)
    return (
      <View style={styles.container}>
        <Text>Not logged in.</Text>
        <Link href="/login" style={styles.link}>
          Log in
        </Link>
      </View>
    );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Signed in ✓</Text>
      <Text>ID: {user.id}</Text>
      <Text>Email: {user.email}</Text>
      <Button title="Log out" onPress={() => logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 24, fontWeight: "bold" },
  link: { color: "#2563eb" },
});
