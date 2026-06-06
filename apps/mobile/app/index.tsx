import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { getSession } from "@/api/client";

export default function Index() {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      setAuthed(Boolean(s));
      setChecked(true);
    });
  }, []);

  if (!checked) return null;
  return authed ? <Redirect href="/(tabs)/chats" /> : <Redirect href="/login" />;
}
