import streamlit as st
import pandas as pd
import json
import math
from streamlit_echarts import st_echarts, JsCode

st.set_page_config(layout="wide")

# Reading the dictionary from the text file
with open('colors.txt', 'r') as file:
    COLORS = json.load(file)

def main():
    st.sidebar.title('Power Generation Visualization')

    category_name = st.sidebar.selectbox(
        'Select Energy Type',
        ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables'],
        index=0
    )

    df, df_7mean = data_read()

    option, ROWS_PER_GRID, PLOT_HEIGHT = generate_grid_option(df_7mean, category_name)

    st_echarts(options=option, height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")

    unique_years_all = df_7mean['year'].unique()
    colors_for_years = dict(zip(unique_years_all, get_line_colors(len(unique_years_all), category_name)))

    st.sidebar.subheader("Legend: Year Colors")
    for year, color in colors_for_years.items():
        st.sidebar.markdown(f"<span style='color: {color};'>■</span> {year}", unsafe_allow_html=True)

    if category_name == 'total':
        csv_data = df[df['type'] != 'total'].to_csv(index=False)
    else:
        csv_data = df[df['type'] == category_name].to_csv(index=False)

    st.sidebar.download_button(
        label=f"Download {category_name} Data as CSV",
        data=csv_data,
        file_name=f"{category_name}_data.csv",
        mime="text/csv"
    )

def get_date_ranges(df, category_name):
    """Get min and max values for each date (month-day) excluding the latest year."""
    latest_year = df['year'].max()
    df_excluding_latest = df[df['year'] != latest_year].reset_index(drop=True)

    # Create a month-day column to group by
    df_excluding_latest['month_day'] = df_excluding_latest['date'].dt.strftime('%m-%d')
    grouped = df_excluding_latest[df_excluding_latest['type'] == category_name].groupby('month_day')

    # Get the min and max for each month-day
    min_vals = grouped['value'].min().tolist()
    max_vals = grouped['value'].max().tolist()
    
    return min_vals, max_vals


def generate_grid_option(df_7mean, category_name):
    countries = df_7mean['country'].unique().tolist()
    
    COLS = 4
    ROWS = int(math.ceil(len(countries) / COLS))
    WIDTH = 100 / COLS
    HEIGHT = 100 / ROWS
    ROWS_PER_GRID = math.ceil(len(countries) / COLS)
    PLOT_HEIGHT = 250
    WIDTH_ADJUSTMENT = 0.8
    HEIGHT_ADJUSTMENT = 2.5

    formatted_dates = df_7mean['date'].dt.strftime('%b-%d').drop_duplicates().tolist()

    option = {
        "tooltip": {
            "trigger": "axis"
        },
        "xAxis": [],
        "yAxis": [],
        "grid": [],
        "series": []
    }

    unique_years_all = df_7mean['year'].unique()
    colors_for_years = dict(zip(unique_years_all, get_line_colors(len(unique_years_all), category_name)))

    for idx, country in enumerate(countries):
        option["grid"].append({
            "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT}%",
            "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
            "width": f"{WIDTH - 2 * WIDTH_ADJUSTMENT}%",
            "height": f"{HEIGHT - 2 * HEIGHT_ADJUSTMENT}%",
            "containLabel": True
        })

        country_data = df_7mean[df_7mean['country'] == country]
        min_val = float(round(country_data[country_data['type'] == category_name]['value'].min() * 0.95))
        max_val = float(round(country_data[country_data['type'] == category_name]['value'].max() * 1.05))

        option["xAxis"].append({
            "gridIndex": idx,
            "type": "category",
            "data": formatted_dates,
        })

        option["yAxis"].append({
            "gridIndex": idx,
            "type": "value",
            "min": min_val,
            "max": max_val,
            "name": country,
            "nameTextStyle": {
                "fontSize": 14,  # 根据需要进行调整
                "fontWeight": "bold",
                "padding": [0, 0, 0, 200]  # 如果需要，添加一些填充。[上，右，下，左]
            }
        })

        # Get min and max values for shadow area
        date_min_values, date_max_values = get_date_ranges(country_data, category_name)
        
        # Add the min series without any fill
        option["series"].append({
            "name": f"Min {country}",
            "type": 'line',
            "xAxisIndex": idx,
            "yAxisIndex": idx,
            "data": date_min_values,
            "showSymbol": False,
            "z": 99  # Ensure it's below the Max series
        })
        
        # Add the max series and fill the area between the min and max lines
        option["series"].append({
            "name": f"Max {country}",
            "type": 'line',
            "xAxisIndex": idx,
            "yAxisIndex": idx,
            "data": date_max_values,
            "showSymbol": False,
            "areaStyle": {"color": 'rgba(150, 150, 150, 1)'},  # Desired shadow color
            "z": 100  # On top of the Min series
        })



        # # Add the line for the latest year
        # latest_year_data = country_data[country_data['year'] == country_data['year'].max()]
        # option["series"].append({
        #     "name": f"{country} {latest_year_data['year'].iloc[0]}",
        #     "type": 'line',
        #     "xAxisIndex": idx,
        #     "yAxisIndex": idx,
        #     "data": latest_year_data['value'].tolist(),
        #     "itemStyle": {"color": colors_for_years[latest_year_data['year'].iloc[0]]},
        #     "smooth": True
        # })


    return option, ROWS_PER_GRID, PLOT_HEIGHT



@st.cache
def data_read():
    df = pd.read_csv('./data/data_for_download.csv')
    df_7mean = pd.read_csv('./data/data_for_line_chart.csv')

    df['date'] = pd.to_datetime(df['date'])
    df_7mean['date'] = pd.to_datetime(df_7mean['date'])

    return df, df_7mean

def get_line_colors(num_years, category_name):
    base_grey = 200
    decrement = 15
    colors = []

    for _ in range(num_years - 1):
        rgb_color = f'rgb({base_grey},{base_grey},{base_grey})'
        colors.append(rgb_color)
        base_grey = max(50, base_grey - decrement)

    colors.append(COLORS.get(category_name, 'rgb(220,20,60)'))

    return colors

if __name__ == '__main__':
    main()
