import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { listConversations, Conversation } from "@/api/chat";

function ConvItem({ item, onPress }: { item: Conversation; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(item.title ?? "?")[0].toUpperCase()}</Text>
      </View>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title ?? "Untitled"}
        </Text>
        {item.last_message ? (
          <Text style={styles.itemPreview} numberOfLines={1}>
            {item.last_message.body}
          </Text>
        ) : (
          <Text style={styles.itemPreviewEmpty}>No messages yet</Text>
        )}
      </View>
      {item.unread_count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.unread_count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function ChatsScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await listConversations();
      setConversations(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load chats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4c72ff" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={conversations}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <ConvItem
          item={item}
          onPress={() => router.push(`/chat/${item.id}`)}
        />
      )}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          tintColor="#4c72ff"
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No conversations yet</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#0f0f13" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a24",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#2d2d4a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { color: "#8b95c9", fontSize: 18, fontWeight: "700" },
  itemBody: { flex: 1 },
  itemTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  itemPreview: { color: "#666", fontSize: 14, marginTop: 2 },
  itemPreviewEmpty: { color: "#444", fontSize: 14, marginTop: 2, fontStyle: "italic" },
  badge: {
    backgroundColor: "#4c72ff",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  errorText: { color: "#ff6b6b", marginBottom: 12 },
  retry: { backgroundColor: "#4c72ff", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
  emptyText: { color: "#555" },
});
