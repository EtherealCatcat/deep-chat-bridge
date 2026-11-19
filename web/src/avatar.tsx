import { createContext, useContext } from "react";

export const DEFAULT_AVATAR = "/avatar.png";
export const AvatarContext = createContext<string>(DEFAULT_AVATAR);

export function useAvatar(): string {
  return useContext(AvatarContext);
}
