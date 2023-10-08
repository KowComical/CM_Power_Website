import streamlit as st
import pandas as pd
import math
from streamlit_echarts import st_echarts

COLORS = {
    "coal": "#8D6449",  # Inner Brown/Roast segment
    "gas": "#D69F7E",  # Outer Brown/Roast segment
    "oil": "#B0B0B0",  # Inner Other/Peapod/Musty segment
    "hydro": "#66C2A4",  # Outer Green/Vegetative segment
    "nuclear": "#FF6B85",  # Outer Sweet/Floral segment
    "other": "#8FC15E",  # Inner Green/Vegetative segment
    "solar": "#FFEB59",  # Outer Sour/Aromatics segment
    "wind": "#F69D50",  # Outer Fruity segment
}


def main():
    df_7mean = data_read()
    option, ROWS_PER_GRID, PLOT_HEIGHT = generate_grid_area_option(df_7mean)

    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")


@st.cache_data
def data_read():
    df_7mean = pd.read_csv('/data/xuanrenSong/CM_Power_Website/data/data_for_stacked_area_chart.csv')

    df_7mean['date'] = pd.to_datetime(df_7mean['date'])

    return df_7mean


def generate_grid_area_option(df_7mean):
    countries = df_7mean['country'].unique().tolist()
    energy_types = df_7mean['type'].unique().tolist()

    COLS = 4
    ROWS = int(math.ceil(len(countries) / COLS))
    WIDTH = 100 / COLS
    HEIGHT = 100 / ROWS

    ROWS_PER_GRID = math.ceil(len(countries) / COLS)
    PLOT_HEIGHT = 250  # 根据需要进行调整

    WIDTH_ADJUSTMENT = 0.8
    HEIGHT_ADJUSTMENT = 2.5

    option = {
        "tooltip": {
            "trigger": "axis"
        },
        "xAxis": [],
        "yAxis": [],
        "grid": [],
        "series": []
    }

    # Grid, xAxis, and yAxis configurations remain the same
    for idx, country in enumerate(countries):
        country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
        country_dates = country_data['date'].dt.strftime('%Y-%m-%d').drop_duplicates().tolist()

        option["grid"].append({
            "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT}%",
            "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
            "width": f"{WIDTH - 2 * WIDTH_ADJUSTMENT}%",
            "height": f"{HEIGHT - 2 * HEIGHT_ADJUSTMENT}%",
            "containLabel": True
        })

        option["xAxis"].append({
            "gridIndex": idx,
            "type": "category",
            "data": country_dates
        })

        option["yAxis"].append({
            "gridIndex": idx,
            "type": "value",
            "min": 0,
            "max": 100,
            "name": country,
            "nameTextStyle": {
                "fontSize": 14,
                "fontWeight": "bold",
                "padding": [0, 0, 0, 200]
            }
        })

    # New nested structure for series creation
    for energy_type in energy_types:
        for idx, country in enumerate(countries):
            country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
            series_data = country_data[country_data['type'] == energy_type]['percentage'].tolist()

            if len(series_data) == len(option["xAxis"][idx]["data"]):  # Ensure data alignment
                option["series"].append({
                    "name": energy_type,
                    "type": "line",
                    "stack": country,  # Unique stack label based on country name
                    "areaStyle": {"color": COLORS.get(energy_type)},
                    "itemStyle": {"color": COLORS.get(energy_type)},
                    "xAxisIndex": idx,
                    "yAxisIndex": idx,
                    "data": series_data
                })

    return option, ROWS_PER_GRID, PLOT_HEIGHT


if __name__ == '__main__':
    main()
