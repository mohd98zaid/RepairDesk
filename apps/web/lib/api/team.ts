import { api } from "./client";

export const teamApi = {
    list: async () => {
        const { data } = await api.get("/team");
        return data;
    },
};
