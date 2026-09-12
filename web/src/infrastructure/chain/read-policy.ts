export const chainReadPolicy = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
  refetchInterval: 15_000,
  retry: false,
} as const;
