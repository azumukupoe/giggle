export async function getFollowedArtists(accessToken: string) {
    try {
        const response = await fetch("https://api.spotify.com/v1/me/following?type=artist&limit=50", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error("Failed to fetch followed artists");
        }

        const data = await response.json();
        return data.artists.items.map((artist: any) => artist.name);
    } catch (error) {
        console.error("Error fetching Spotify artists:", error);
        return [];
    }
}
