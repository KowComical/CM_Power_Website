import streamlit as st
import pandas as pd
import math
from streamlit_echarts import st_echarts
import json

# Reading the dictionary from the text file
with open('./data/colors.txt', 'r') as file:
    COLORS = json.load(file)


def main():
    df_7mean = data_read()

    option, ROWS_PER_GRID, PLOT_HEIGHT = generate_grid_area_option(df_7mean)
    
    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")
    
    st.sidebar.subheader("Legend: Energy Types")
    for energy_type, color in COLORS.items():
        st.sidebar.markdown(f"<span style='color: {color};'>■</span> {energy_type.capitalize()}", unsafe_allow_html=True)


@st.cache_data
def data_read():
    df_7mean = pd.read_csv('./data/data_for_stacked_area_chart.csv')
    df_7mean['percentage'] = round(df_7mean['percentage'],2)

    df_7mean['date'] = pd.to_datetime(df_7mean['date'])

    return df_7mean


def generate_grid_area_option(df_7mean):
    countries = df_7mean['country'].unique().tolist()
    energy_types = ['coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other']

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
                "padding": [0, 0, 0, 100]
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


def custom_css_for_spinner():
    st.markdown("""
<style>.stSpinner > div > div {
    border-top-color: #0f0;
}</style>
""", unsafe_allow_html=True)



if __name__ == '__main__':
    custom_css_for_spinner()
    with st.spinner('Loading page...'):
        main()
