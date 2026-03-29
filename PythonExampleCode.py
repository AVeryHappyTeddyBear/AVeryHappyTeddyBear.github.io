import os
import math
import pandas as pd
from demoparser2 import DemoParser

demoLibraryPath = "E:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\replays"


def parse_demo_file(file_path):
    parser = DemoParser(file_path)
    player_hurt_events = parser.parse_event("player_death", player=["team_name"], other=["is_warmup_period"])
    df = parser.parse_ticks(["X", "Y", "Z", "accuracy_penalty", "user_steamid", "active_weapon_name"])

    result_df = pd.DataFrame()

    for (idx, event) in player_hurt_events.iterrows():
        # Filter out warmup
        if event["is_warmup_period"]:
            continue
        else:
            death_tick = event["tick"]-1
            attacker = event["attacker_steamid"]
            victim = event["user_steamid"]
            # attacker can be none when player gets hurt by c4 etc.
            if attacker != None and victim != attacker and event["attacker_team_name"] != event["user_team_name"]:
                subdfAttacker = df[(df["tick"] == death_tick) & (df["steamid"] == int(attacker))].copy()
                subdfVictim = df[(df["tick"] == death_tick) & (df["steamid"] == int(victim))].copy()
                # From the Attacker subdf extract accuracy_penalty, X, Y, Z, and name.
                # From Victim subdf extract X, Y, Z, and name.
                subdfAttacker = subdfAttacker[["tick", "accuracy_penalty", "X", "Y", "Z", "steamid", "name", "active_weapon_name"]]
                subdfVictim = subdfVictim[["tick", "X", "Y", "Z", "steamid", "name"]]
                subdfAttacker = subdfAttacker.rename(columns={"X": "attacker_X", "Y": "attacker_Y", "Z": "attacker_Z", "steamid": "attacker_steamid", "name": "attacker_name", "active_weapon_name": "attacker_weapon_name"})
                subdfVictim = subdfVictim.rename(columns={"X": "victim_X", "Y": "victim_Y", "Z": "victim_Z", "steamid": "victim_steamid", "name": "victim_name"})
                combined_subdf = pd.merge(subdfAttacker, subdfVictim, on="tick", how="inner")

                # Calculate distance between attacker and victim
                combined_subdf["distance"] = ((combined_subdf["attacker_X"] - combined_subdf["victim_X"]) ** 2 + (combined_subdf["attacker_Y"] - combined_subdf["victim_Y"]) ** 2 + (combined_subdf["attacker_Z"] - combined_subdf["victim_Z"]) ** 2) ** 0.5
                
                combined_subdf["Spread (cm)"] = combined_subdf["accuracy_penalty"] * combined_subdf["distance"] * 0.19685

                # Remove attacker and victim coordinates
                combined_subdf = combined_subdf.drop(columns=["attacker_X", "attacker_Y", "attacker_Z", "victim_X", "victim_Y", "victim_Z"])
                result_df = pd.concat([result_df, combined_subdf], ignore_index=True)

    # Print full dataframe with all columns and rows
    pd.set_option('display.max_columns', None)
    pd.set_option('display.max_rows', None)
    pd.set_option('display.width', None)
    print(result_df)

    # Sum each Victims unluckiness
    unluckiness_sum = result_df.groupby("victim_name")["Spread (cm)"].mean().reset_index()
    unluckiness_sum = unluckiness_sum.rename(columns={"Spread (cm)": "Average Spread (cm)"})
    # Sort by unluckiness
    unluckiness_sum = unluckiness_sum.sort_values(by="Average Spread (cm)", ascending=False)
    unluckiness_sum = unluckiness_sum.set_index("victim_name")
    print(unluckiness_sum)

    # Sum each attackers unluckiness
    unluckiness_sum_attacker = result_df.groupby("attacker_name")["Spread (cm)"].mean().reset_index()
    unluckiness_sum_attacker = unluckiness_sum_attacker.rename(columns={"Spread (cm)": "Average Spread (cm)"})
    # Sort by unluckiness
    unluckiness_sum_attacker = unluckiness_sum_attacker.sort_values(by="Average Spread (cm)", ascending=False)
    unluckiness_sum_attacker = unluckiness_sum_attacker.set_index("attacker_name")
    print(unluckiness_sum_attacker)

    # Top 5 unluckiest deaths (highest spread individual kills)
    top_5_unlucky = result_df.nlargest(5, "Spread (cm)")[["victim_name", "attacker_name", "attacker_weapon_name", "distance", "accuracy_penalty", "Spread (cm)"]].reset_index(drop=True)
    top_5_unlucky.columns = ["Victim", "Attacker", "Weapon", "Distance", "Accuracy Penalty", "Spread (cm)"]
    print("\n\n=== TOP 5 UNLUCKIEST DEATHS ===")
    print(top_5_unlucky.to_string(index=False))


# List the available demo files in the specified directory
demo_files = [f for f in os.listdir(demoLibraryPath) if f.endswith('.dem')]
if not demo_files:
    print("No demo files found in the specified directory.")
    exit()
# Print the available demo files    print("Available demo files:")
for idx, demo_file in enumerate(demo_files):
    print(f"{idx + 1}. {demo_file}")
# Prompt the user to select a demo file    
while True:
    selected_file = None
    try:
        choice = int(input("Enter the number of the demo file you want to parse: "))
        if 1 <= choice <= len(demo_files):
            selected_file = demo_files[choice - 1]
            break
        else:
            print("Invalid choice. Please enter a valid number.")
    except ValueError:
        print("Invalid input. Please enter a number.")

# Parse the selected demo file
if selected_file is not None:
    print(f"Parsing {selected_file}...")
    parse_demo_file(os.path.join(demoLibraryPath, selected_file))