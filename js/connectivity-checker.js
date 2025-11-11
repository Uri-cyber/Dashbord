/**
 * ==============================================================================
 * CONNECTIVITY CHECKER MODULE
 * ==============================================================================
 * 
 * Monitors internet connectivity and displays warning banner.
 * 
 * Dependencies:
 * - None (standalone module)
 * 
 * Functions exported to global scope:
 * - checkLocalConnectivity()
 * 
 * ==============================================================================
 */

/**
 * Check local internet connectivity by testing DNS servers
 * 
 * Shows/hides connectivity warning banner based on results.
 */
function checkLocalConnectivity() {
    const dnsServers = ["https://dns.google", "https://8.8.8.8", "https://8.8.4.4"];
    const banner = document.getElementById("connectivity-warning");
    let success = false;

    Promise.allSettled(
        dnsServers.map(server =>
            fetch(server, { method: "HEAD", mode: "no-cors" })
        )
    ).then(results => {
        success = results.some(result => result.status === "fulfilled");

        if (!success) {
            document.body.classList.add("connection-lost");
            if (banner) banner.style.display = "block";
        } else {
            document.body.classList.remove("connection-lost");
            if (banner) banner.style.display = "none";
        }
    }).catch(() => {
        document.body.classList.add("connection-lost");
        if (banner) banner.style.display = "block";
    });
}
