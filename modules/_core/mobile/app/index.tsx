import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";
import { navLinks } from "@/nav";

export default function Home() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{{projectName}}</Text>
      <Text style={styles.subtitle}>Generated with base — start building.</Text>
      {navLinks.map((l) => (
        <Link key={l.href} href={l.href as never} style={styles.link}>
          {l.label}
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "bold" },
  subtitle: { color: "#555" },
  link: { color: "#2563eb", fontSize: 16 },
});
